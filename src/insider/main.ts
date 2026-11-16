import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import {
  CLASSES,
  MAX_CITES,
  POINTS,
  RESPONSES,
  SOURCES,
  THRESHOLDS,
  advance,
  bestResponses,
  canCheck,
  check,
  checkedFor,
  createGame,
  currentCase,
  fileCase,
  gradeCase,
  isFiled,
  learning,
  meters,
  score,
  type Case,
  type CaseResult,
  type Classification,
  type GameState,
  type Response,
  type Source,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-insider-or-accident/the-data-loss-queue/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CLASS_NAME = Object.fromEntries(CLASSES.map((entry) => [entry.id, entry.name])) as Record<Classification, string>;
const RESPONSE_NAME = Object.fromEntries(RESPONSES.map((entry) => [entry.id, entry.name])) as Record<Response, string>;
const SOURCE_NAME = Object.fromEntries(SOURCES.map((entry) => [entry.id, entry.name])) as Record<Source, string>;
const GRADE_LABEL = { best: "Proportionate", ok: "Partly right", poor: "Wrong response" } as const;
const cases = SCENARIO.cases;
const PACE = Math.floor(SCENARIO.budget / cases.length);

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

type Draft = { classification: Classification | null; cites: Source[]; response: Response | null };
const emptyDraft = (): Draft => ({ classification: null, cites: [], response: null });

let state: GameState = createGame(SCENARIO);
let draft: Draft = emptyDraft();
let lastResult: CaseResult | null = null;
let fresh: Source | null = null; // the fact just revealed: only that one animates in
let started = performance.now();
$("#logo").innerHTML = LOGO;

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function meterHtml(): string {
  const { trust, exposure } = meters(state);
  const delta = lastResult?.outcome ?? null;
  const bar = (id: string, label: string, value: number, limit: number, bad: boolean, note: string, change: number | undefined, goodWhenUp: boolean) => `
    <div class="ioa-meter ${id} ${bad ? "bad" : ""}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      <div class="ioa-meter-top"><span>${label}</span><strong>${value}</strong>${change ? `<em class="${change > 0 === goodWhenUp ? "up" : "down"}">${signed(change)}</em>` : ""}</div>
      <div class="ioa-track"><i style="width:${value}%"></i><b style="left:${limit}%"></b></div>
      <small>${note}</small>
    </div>`;
  return (
    bar("trust", "Staff trust", trust, THRESHOLDS.minTrust, trust < THRESHOLDS.minTrust, `Keep at or above ${THRESHOLDS.minTrust}`, delta?.trust, true) +
    bar("exposure", "Data exposure", exposure, THRESHOLDS.maxExposure, exposure > THRESHOLDS.maxExposure, `Keep at or below ${THRESHOLDS.maxExposure}`, delta?.exposure, false)
  );
}

// Re-rendering replaces the buttons, so put focus back on the control the player was using.
function keepFocus(work: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  const key = active?.dataset?.act ? `[data-act="${active.dataset.act}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ""}` : null;
  work();
  if (key) document.querySelector<HTMLElement>(key)?.focus();
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const entry = currentCase(state);
  const filed = isFiled(state, entry.id);
  const checked = checkedFor(state, entry.id);
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${cases.length}</strong><span>Case</span></div>
    <div class="count"><strong id="checks-left">${state.checksLeft}</strong><span>Checks left</span></div>`;

  $("#queue").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Your shift</h2><span class="phase-pill">${entry.guided ? "Guided" : entry.hint ? "With a hint" : "No hints"}</span></div>
    <div class="d-scroll">
      ${meterHtml()}
      <div class="ioa-budget ${state.checksLeft === 0 ? "out" : state.checksLeft < PACE ? "low" : ""}">
        <div class="ioa-meter-top"><span>Checks left for the whole shift</span><strong>${state.checksLeft}<small>/${SCENARIO.budget}</small></strong></div>
        <div class="ioa-pips" aria-hidden="true">${Array.from({ length: SCENARIO.budget }, (_, i) => `<i class="${i < state.checksLeft ? "on" : ""}"></i>`).join("")}</div>
        <small>${cases.length} cases, ${SOURCES.length} sources each. About ${PACE} checks a case.</small>
      </div>
      <h4 class="sub-head">Alert queue</h4>
      <ol class="ioa-queue">
        ${cases
          .map((item, i) => {
            const result = isFiled(state, item.id) ? gradeCase(item, checkedFor(state, item.id), state.filings[item.id]) : null;
            const cls = i === state.index ? "now" : result ? "filed" : "later";
            return `<li class="${cls}" ${i === state.index ? 'aria-current="step"' : ""}><span><b>${i + 1}. ${esc(i <= state.index ? item.title : "Waiting")}</b><small>${i <= state.index ? esc(item.person) : "Not opened yet"}</small></span>${result ? `<em class="g-${result.grade}">${result.points}/${POINTS.perCase}</em>` : i === state.index ? `<em class="todo">open</em>` : ""}</li>`;
          })
          .join("")}
      </ol>
    </div>`;

  $("#file-head").innerHTML = `<h2>Case file</h2><span>${esc(entry.person)} · ${esc(entry.job)}</span>`;
  $("#file-view").innerHTML = `
    <div class="ioa-alert">
      <p class="kicker">Data-loss alert · ${esc(SCENARIO.org)}</p>
      <h3 class="d-title">${esc(entry.title)}</h3>
      <p class="brief">${esc(entry.alert)}</p>
      <p class="muted small">Named on the alert: <b>${esc(entry.person)}</b>, ${esc(entry.job)}. An alert names an account. It does not tell you what the person did or why.</p>
    </div>
    ${coach(entry)}
    <h4 class="sub-head">Evidence sources · ${checked.length} of ${SOURCES.length} checked${filed ? "" : " · each check costs 1"}</h4>
    <div class="ioa-sources" role="group" aria-label="Evidence sources">
      ${SOURCES.map((source, i) => {
        const seen = checked.includes(source.id);
        const deciding = filed && entry.deciding.includes(source.id);
        if (seen || deciding) {
          return `<div class="ioa-fact ${deciding ? "deciding" : ""} ${seen ? "" : "skipped"} ${fresh === source.id ? "new" : ""}" data-id="${source.id}"><b>${esc(source.name)}${deciding ? `<em>${seen ? "deciding evidence" : "deciding evidence you skipped"}</em>` : ""}</b><span>${esc(entry.facts[source.id])}</span></div>`;
        }
        return `<button class="ioa-source" data-act="check" data-id="${source.id}" ${canCheck(state, source.id) ? "" : "disabled"}><kbd>${i + 1}</kbd><span><b>${esc(source.name)}</b><small>${esc(source.asks)}</small></span></button>`;
      }).join("")}
    </div>`;
  renderCall(entry);
  renderNext(entry);
}

// Coach lines: what to look at and why, never which answer to give.
function coach(entry: Case): string {
  if (isFiled(state, entry.id)) return "";
  if (entry.guided) {
    const count = checkedFor(state, entry.id).length;
    let text: string;
    if (count === 0) text = `An alert is where the question starts. Pull the <strong>audit log</strong> first to see exactly what happened, then pick one or two sources that would tell an accident from something worse: what did the person do <em>next</em>, and where did the data go?`;
    else if (count < 3) text = `Each fact changes what is likely. Ask what you still cannot rule out, and check the source that would settle it. You have about ${PACE} checks a case, so leave the rest.`;
    else text = `That is enough to decide. On the right: say what it was, tick the one or two facts that support that reading, and choose a response that fits. Unticked facts do not count as support.`;
    return `<div class="coach"><strong>Guided case.</strong> ${text}</div>`;
  }
  if (entry.hint) return `<div class="coach"><strong>Hint.</strong> ${esc(entry.hint)}</div>`;
  return `<div class="coach ioa-nohint"><strong>No hints.</strong> You have seen this kind of alert before. Decide what would tell the possibilities apart, and check that.</div>`;
}

function renderCall(entry: Case): void {
  const box = $("#call");
  const filed = isFiled(state, entry.id);
  const checked = checkedFor(state, entry.id);
  const filing = state.filings[entry.id];
  const cls = filed ? filing.classification : draft.classification;
  const resp = filed ? filing.response : draft.response;
  const cites = filed ? filing.cites : draft.cites;
  const result = filed ? lastResult ?? gradeCase(entry, checked, filing) : null;
  const best = bestResponses(entry);
  const last = state.index === cases.length - 1;
  box.innerHTML = `
    <div class="col-head"><h2>Your call</h2><span>${filed ? "Filed" : "Final once filed"}</span></div>
    <div class="d-scroll">
      ${
        result?.outcome
          ? `<div class="outcome ${result.grade === "best" ? "good" : result.grade === "ok" ? "ok" : "bad"}" id="outcome" role="status" tabindex="-1">
              <strong>${GRADE_LABEL[result.grade]} · ${result.points}/${POINTS.perCase} points · Trust ${signed(result.outcome.trust)} · Exposure ${signed(result.outcome.exposure)}</strong>
              <span class="sub-head">What happened next</span>
              <span>${esc(result.outcome.text)}</span>
              <span class="sub-head">What it was</span>
              <span><b>${CLASS_NAME[entry.truth]}.</b> ${esc(entry.truthText)}</span>
              ${result.supported ? "" : `<span class="warn-text">${checked.length ? "None of the facts you cited supports what happened" : "You filed this without checking anything"}, so the call counts as unsupported: no classification points and half response points.</span>`}
              ${result.grade === "best" ? "" : `<span class="muted small">Proportionate here: <b>${best.map((id) => RESPONSE_NAME[id]).join(" or ")}</b>.</span>`}
              <span class="muted small">${esc(entry.lesson)}</span>
            </div>
            <button class="btn primary" data-act="next">${last ? "See the debrief" : "Next case"}</button>`
          : ""
      }
      <h4 class="sub-head">1 · What was it?</h4>
      <div class="decisions" role="group" aria-label="Classification">
        ${CLASSES.map((item) => {
          const marks = [cls === item.id ? "on" : "", filed && item.id === entry.truth && cls !== item.id ? "best" : ""].join(" ");
          return `<button class="dec-btn ioa-c-${item.id} ${marks}" data-act="classify" data-id="${item.id}" ${filed ? "disabled" : ""} aria-pressed="${cls === item.id}"><span><b>${item.name}</b><small>${esc(item.rule)}</small></span></button>`;
        }).join("")}
      </div>
      <h4 class="sub-head">2 · Which facts support that? (up to ${MAX_CITES})</h4>
      ${
        checked.length
          ? `<div class="ioa-cites" role="group" aria-label="Supporting evidence">${checked
              .map((source) => {
                const on = cites.includes(source);
                const mark = filed && on ? (entry.supports.includes(source) ? "right" : "wrong") : "";
                return `<button class="ioa-cite ${on ? "on" : ""} ${mark}" data-act="cite" data-id="${source}" ${filed ? "disabled" : ""} aria-pressed="${on}"><i aria-hidden="true">${on ? "✓" : ""}</i><span>${SOURCE_NAME[source]}${mark ? `<small>${mark === "right" ? "supports what happened" : "does not settle it"}</small>` : ""}</span></button>`;
              })
              .join("")}</div>`
          : `<p class="warn-text small" id="no-evidence">Nothing checked yet, so there is nothing to cite. A call without evidence does not stand.</p>`
      }
      <h4 class="sub-head">3 · What should happen?</h4>
      <div class="decisions" role="group" aria-label="Response">
        ${RESPONSES.map((item) => {
          const marks = [resp === item.id ? "on" : "", filed && best.includes(item.id) && resp !== item.id ? "best" : ""].join(" ");
          return `<button class="dec-btn ioa-r-${item.id} ${marks}" data-act="respond" data-id="${item.id}" ${filed ? "disabled" : ""} aria-pressed="${resp === item.id}"><span><b>${item.name}</b><small>${esc(item.rule)}</small></span></button>`;
        }).join("")}
      </div>
      ${!filed && draft.classification && draft.response && !draft.cites.length && checked.length ? `<p class="warn-text small" id="no-cites">No facts ticked. Filed like this, the call counts as unsupported.</p>` : ""}
      ${filed ? "" : `<button class="btn primary" data-act="file" ${draft.classification && draft.response ? "" : "disabled"}>File the decision</button>`}
    </div>`;
}

function renderNext(entry: Case): void {
  const filed = isFiled(state, entry.id);
  const count = checkedFor(state, entry.id).length;
  const last = state.index === cases.length - 1;
  const left = cases.length - state.index;
  const pool = `${state.checksLeft} check${state.checksLeft === 1 ? "" : "s"} left for ${left} case${left === 1 ? "" : "s"}.`;
  let step: NextStep;
  if (filed) {
    step = { label: "Done", tone: "ready", text: `Read what happened next, then press <strong>${last ? "See the debrief" : "Next case"}</strong> (or <kbd>N</kbd>).`, targets: ['[data-act="next"]'] };
  } else if (count === 0 && state.checksLeft === 0) {
    step = { label: "Check", tone: "warn", text: `You are out of checks. You can still file a call on the right, but with no evidence behind it.`, hint: "Checks are shared across the whole shift.", targets: [] };
  } else if (count === 0) {
    step = {
      text: entry.guided ? `Start with the <strong>audit log</strong> (pulsing): click it, or press <kbd>1</kbd>, to spend one check and reveal a fact.` : `Spend a check on the source most likely to tell you what this was (click, or press <kbd>1</kbd> to <kbd>8</kbd>).`,
      hint: pool,
      targets: entry.guided ? ['[data-act="check"][data-id="log"]'] : [],
    };
  } else if (!draft.classification) {
    step = {
      text: state.checksLeft === 0 ? `You are out of checks. Decide with what you have: say <strong>what it was</strong> on the right.` : count < 2 ? `Check another source if you still cannot tell the possibilities apart. When you can, say <strong>what it was</strong> on the right.` : `Enough to decide? Say <strong>what it was</strong> on the right, or spend another check if something is still open.`,
      hint: `${pool} You do not need every source.`,
      targets: [],
    };
  } else if (!draft.cites.length) {
    step = { text: `Tick the <strong>one or two facts that support</strong> your reading.`, hint: "A fact can be true and still not settle the question. Pick the ones that would persuade someone else.", targets: [".ioa-cites"] };
  } else if (!draft.response) {
    step = { text: `Choose the <strong>response that fits</strong> what you found: proportionate to the evidence, fair to the person.`, targets: [] };
  } else {
    step = { label: "Ready", tone: "ready", text: `Press <strong>File the decision</strong>. It is final, and the outcome plays out straight away.`, targets: ['[data-act="file"]'] };
  }
  renderNextStep($("#next-step"), step);
}

function onCheck(source: Source): void {
  const entry = currentCase(state);
  if (!canCheck(state, source)) {
    if (!isFiled(state, entry.id) && state.checksLeft === 0) announce("No checks left for this shift.");
    return;
  }
  const fact = check(state, source)!;
  fresh = source;
  play("click");
  post("statement", { at: new Date().toISOString(), verb: "checked", object: `${entry.id}/${source}`, result: { checksLeft: state.checksLeft } });
  render();
  fresh = null;
  document.querySelector<HTMLElement>(`.ioa-source:not(:disabled)`)?.focus();
  announce(`${SOURCE_NAME[source]}: ${fact} ${state.checksLeft} checks left.`);
}

function onCite(source: Source): void {
  if (draft.cites.includes(source)) draft.cites = draft.cites.filter((id) => id !== source);
  else if (draft.cites.length >= MAX_CITES) return announce(`You can cite up to ${MAX_CITES} facts. Untick one first.`);
  else draft.cites = [...draft.cites, source];
  play("click");
  keepFocus(render);
}

function onFile(): void {
  if (!draft.classification || !draft.response) return;
  const entry = currentCase(state);
  const result = fileCase(state, { classification: draft.classification, cites: draft.cites, response: draft.response });
  if (!result || !result.outcome) return;
  lastResult = result;
  play(result.grade === "best" && result.classRight ? "success" : result.grade === "poor" ? "setback" : "deliver");
  post("statement", { at: new Date().toISOString(), verb: "decided", object: entry.id, result: { classification: draft.classification, response: draft.response, cites: draft.cites, checks: result.checks, classRight: result.classRight, supported: result.supported, grade: result.grade, points: result.points } });
  render();
  const outcome = $("#outcome");
  outcome.focus({ preventScroll: true });
  outcome.scrollIntoView({ block: "nearest" });
  announce(`${GRADE_LABEL[result.grade]}. ${result.points} of ${POINTS.perCase} points. It was: ${CLASS_NAME[entry.truth]}. ${result.outcome.text}`);
}

function onNext(): void {
  if (!advance(state)) return;
  draft = emptyDraft();
  lastResult = null;
  play("click");
  render();
  if (state.phase === "play") {
    $("#file-view").scrollTop = 0;
    const scroller = document.querySelector<HTMLElement>("#call .d-scroll");
    if (scroller) scroller.scrollTop = 0;
    document.querySelector<HTMLElement>(".ioa-source:not(:disabled)")?.focus();
    announce(`Case ${state.index + 1} of ${cases.length}: ${currentCase(state).alert}`);
  }
}

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!button || (button as HTMLButtonElement).disabled) return;
  const { act, id } = button.dataset;
  if (act === "check") onCheck(id as Source);
  else if (act === "classify") {
    draft.classification = id as Classification;
    play("click");
    keepFocus(render);
  } else if (act === "cite") onCite(id as Source);
  else if (act === "respond") {
    draft.response = id as Response;
    play("click");
    keepFocus(render);
  } else if (act === "file") onFile();
  else if (act === "next") onNext();
  else if (act === "retry") start(true);
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || state.phase !== "play" || event.ctrlKey || event.metaKey || event.altKey) return;
  const index = Number(event.key) - 1;
  if (event.key.length === 1 && Number.isInteger(index) && index >= 0 && index < SOURCES.length) {
    event.preventDefault();
    onCheck(SOURCES[index].id);
  } else if (event.key.toLowerCase() === "n" && isFiled(state, currentCase(state).id)) {
    event.preventDefault();
    onNext();
  }
});

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}

function renderDebrief(): void {
  const result = score(state);
  const learn = learning(state);
  const byId = (id: string) => cases.find((entry) => entry.id === id)!;
  const names = (ids: readonly string[]) => ids.map((id) => esc(byId(id).person)).join(", ");
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: result, learning: learn, filings: state.filings, checked: state.checked });
  try {
    localStorage.setItem("ares-insider:lastResult", JSON.stringify({ total: result.total, passed: result.passed }));
  } catch {
    // Optional.
  }
  const n = cases.length;
  const habits: string[] = [];
  if (learn.overAccused.length) habits.push(`<strong>Treated as a suspect without the evidence:</strong> ${names(learn.overAccused)}. Suspending or accusing a colleague who made a mistake, followed a broken process or was the victim costs trust across the whole team, and carries a real grievance and legal risk.`);
  if (learn.underReacted.length) habits.push(`<strong>Under-reacted to real loss:</strong> ${names(learn.underReacted)}. Assuming the best is kind, but a deliberate copy or a live intruder does not stop because the case was closed.`);
  if (learn.blindCalls.length) habits.push(`<strong>Decided without checking anything:</strong> ${names(learn.blindCalls)}. An alert names an account. On its own it says nothing about what the person did or why.`);
  if (result.checksUsed === SCENARIO.budget && learn.checksPerCase.some((count) => count >= 6)) habits.push(`<strong>Checked nearly everything early and ran short later.</strong> Ask first what would tell the possibilities apart, and check that.`);
  if (!habits.length) habits.push("Measured: you looked for the evidence that separates the possibilities, and matched the response to what you found.");
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)} · ${esc(SCENARIO.org)}</p>
        <h2 id="debrief-title" tabindex="-1">Score ${result.total}<small>/100</small> · <span class="${result.passed ? "ioa-pass" : "ioa-fail"}">${result.passed ? "Passed" : "Not yet"}</span></h2>
        <p class="muted">${result.raw} of ${result.max} case points with ${result.checksUsed} of ${SCENARIO.budget} checks. Pass: score ${THRESHOLDS.score}+, staff trust ${THRESHOLDS.minTrust} or more, data exposure ${THRESHOLDS.maxExposure} or less.</p>
        ${result.reasons.length ? `<ul class="ioa-reasons">${result.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : ""}
      </header>
      <div class="score-grid wide">
        ${tile("Classification", result.classPoints, n * POINTS.classification, "Right reading, backed by a cited fact")}
        ${tile("Evidence", result.citePoints, n * MAX_CITES * POINTS.cite, "Cited facts that support what happened")}
        ${tile("Response", result.responsePoints, n * POINTS.response.best, "Proportionate to what happened")}
        <div class="score-tile ${result.trust >= THRESHOLDS.minTrust && result.exposure <= THRESHOLDS.maxExposure ? "good" : "bad"}"><span>Meters</span><strong class="ioa-two">${result.trust}<small> trust</small> · ${result.exposure}<small> exposure</small></strong><p>Pass gates, not points</p></div>
      </div>
      <section class="panel">
        <h3>Your calls</h3>
        <div class="ioa-table-wrap"><table class="ioa-table"><thead><tr><th scope="col">Case</th><th scope="col">You called it</th><th scope="col">It was</th><th scope="col">You chose</th><th scope="col">Proportionate</th><th scope="col">Checks</th><th scope="col">Points</th></tr></thead><tbody>
          ${cases
            .map((entry, i) => {
              const filing = state.filings[entry.id];
              const row = result.cases[i];
              return `<tr class="g-${row.grade}" data-id="${entry.id}"><th scope="row">${esc(entry.title)}<small>${esc(entry.person)}</small></th><td class="${row.classRight ? "yes" : "no"}">${CLASS_NAME[filing.classification]}${row.classRight && !row.supported ? " (unsupported)" : ""}</td><td>${CLASS_NAME[entry.truth]}</td><td class="r">${RESPONSE_NAME[filing.response]}</td><td>${bestResponses(entry).map((id) => RESPONSE_NAME[id]).join(" or ")}</td><td>${row.checks}</td><td>${row.points}/${POINTS.perCase}</td></tr>`;
            })
            .join("")}</tbody></table></div>
      </section>
      <section class="panel">
        <h3>The evidence that decided each case</h3>
        <div class="ioa-evidence">
          ${cases
            .map((entry, i) => {
              const row = result.cases[i];
              const filing = state.filings[entry.id];
              const skippedOther = row.unchecked.filter((source) => !entry.deciding.includes(source));
              return `<article class="ioa-ev" data-id="${entry.id}">
                <h4>${esc(entry.title)} <small>${esc(entry.person)} · ${CLASS_NAME[entry.truth]}</small></h4>
                <ul>${entry.deciding
                  .map((source) => {
                    const seen = !row.skippedDeciding.includes(source);
                    const cited = filing.cites.includes(source);
                    return `<li class="${seen ? "seen" : "skipped"}"><b>${SOURCE_NAME[source]}</b> <em>${cited ? "checked and cited" : seen ? "checked, not cited" : "you skipped this"}</em><span>${esc(entry.facts[source])}</span></li>`;
                  })
                  .join("")}</ul>
                <p class="muted small">${skippedOther.length ? `Also left unchecked: ${skippedOther.map((source) => SOURCE_NAME[source]).join(", ")}. ` : ""}${row.skippedDeciding.length === 0 && row.checks <= 4 ? "You found what mattered without checking everything." : ""}</p>
                <p class="small">${esc(entry.lesson)}</p>
              </article>`;
            })
            .join("")}
        </div>
      </section>
      <section class="panel">
        <h3>Three alerts, one log line</h3>
        <p class="small">The three 23:00 alerts had the same audit-log pattern: a large bulk download, one session, a valid sign-in. One was an approved migration, one a deliberate copy by someone leaving, and one an outsider in a stolen session. The log could not tell them apart. The ticket system, the destination and the device did. Two of those three people were on notice or had a recent setback, and only one had done anything wrong.</p>
      </section>
      <section class="panel">
        <h3>Your habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>Learning evidence <small class="muted">(not part of the score)</small></h3>
        <ul class="objectives">
          <li><strong>Reading behaviour in context:</strong> ${learn.classRight} of ${learn.total} cases read correctly; ${learn.supportedCalls} of ${learn.total} calls rested on a fact that supports them.</li>
          <li><strong>Targeted evidence gathering:</strong> found ${learn.decidingFound} of ${learn.decidingTotal} deciding facts with ${result.checksUsed} checks (${learn.checksPerCase.join(", ")} per case).</li>
          <li><strong>Proportionate response:</strong> ${learn.proportionate} of ${learn.total} responses fitted what happened.</li>
          <li><strong>Not jumping to accusation:</strong> ${learn.overAccused.length} colleague${learn.overAccused.length === 1 ? "" : "s"} treated as a suspect without cause · ${learn.underReacted.length} real theft or intrusion under-reacted to · ${learn.blindCalls.length} call${learn.blindCalls.length === 1 ? "" : "s"} made blind.</li>
        </ul>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional organisation and people · Content to be reviewed with SMEs, including HR and legal (docs/design/INSIDER_OR_ACCIDENT.md)</p>
    </div>`;
  $("#debrief-title").focus();
  window.scrollTo(0, 0);
}

function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are the insider-risk analyst on duty at <strong>${esc(SCENARIO.org)}</strong>. ${cases.length} data-loss alerts each name a colleague.</p>
        <p class="tut-lead">For each one: find out what really happened, say what it was, and choose a response that is fair to the person and proportionate to the evidence.</p>
        <p class="tut-note"><span>An alert names an account. It does not tell you what the person did or why. The same log line can be an approved job, a theft or a stolen password.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">!</span><span><b>Case file</b>Middle. The alert, and ${SOURCES.length} evidence sources you can check.</span></div>
          <div><span class="tut-ico box">${SCENARIO.budget}</span><span><b>Checks</b>Left. ${SCENARIO.budget} checks for the whole shift: about ${PACE} a case. Checking everything runs out.</span></div>
          <div><span class="tut-ico box">▮</span><span><b>Staff trust and Data exposure</b>Left. Wrongly treating a colleague as a suspect costs trust. Missing real loss raises exposure.</span></div>
          <div><span class="tut-ico box">✓</span><span><b>Your call</b>Right. What it was, the facts that support it, and what should happen.</span></div>
        </div>
        <p class="tut-note"><span>The bar above the case file always says what to do next.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Check evidence</b><span class="how">Click a source, or press <kbd>1</kbd> to <kbd>8</kbd>. Each check costs one and reveals one fact. Ask: what would tell the possibilities apart?</span></span></li>
          <li><span><b>Say what it was</b><span class="how">${CLASSES.map((item) => `<span class="tut-pill">${item.name}</span>`).join(" ")}</span></span></li>
          <li><span><b>Cite your evidence</b><span class="how">Tick up to ${MAX_CITES} facts that support your reading. A call with no supporting fact does not stand.</span></span></li>
          <li><span><b>Choose the response</b><span class="how">${RESPONSES.map((item) => `<span class="tut-pill">${item.name}</span>`).join(" ")}</span></span></li>
        </ol>
        <p class="tut-note"><span>Filing is final. The outcome plays out straight away, then the next case opens (<kbd>N</kbd>). The first case is guided; the last two have no hints.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Classification <small>${POINTS.classification} a case</small></b>The right reading, backed by at least one cited fact that supports it.</div>
          <div><b>Evidence <small>${MAX_CITES * POINTS.cite} a case</small></b>${POINTS.cite} for each cited fact that supports what really happened.</div>
          <div><b>Response <small>${POINTS.response.best} a case</small></b>${POINTS.response.best} for a proportionate response, ${POINTS.response.ok} for a partly right one. Halved if the call is unsupported.</div>
        </div>
        <p>To pass: score ${THRESHOLDS.score} or more out of 100, staff trust ${THRESHOLDS.minTrust} or more, data exposure ${THRESHOLDS.maxExposure} or less. Calling everyone malicious wrecks trust. Closing everything lets real loss through. Guessing without evidence scores almost nothing.</p>
        <p class="tut-muted">No timer. The debrief shows the evidence that decided each case and what you skipped.</p>
        ${retry ? `<p class="tut-note"><span>Starting again: same queue, fresh checks and meters.</span></p>` : ""}
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
  draft = emptyDraft();
  lastResult = null;
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
    startLabel: retry ? "Start again" : "Open the first case",
    onStart: () => document.querySelector<HTMLElement>('[data-act="check"][data-id="log"]')?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
