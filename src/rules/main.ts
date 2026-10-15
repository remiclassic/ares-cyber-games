import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
import { SCENARIO } from "./data";
import { commit, createGame, currentPuzzle, evaluate, host, move, nextPuzzle, reset, summarize, toggleRule, type GameState, type Rule } from "./engine";

const ACTIVITY_ID = "ares-rule-order/fw-core/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let traced: string | null = null; // packet being traced
let tested = false; // results visible after "Run all tests"
const started = performance.now();
$("#logo").innerHTML = LOGO;

function ruleText(rule: Rule): string {
  return `${esc(rule.srcLabel)} → ${esc(rule.dst === "any" ? "anything" : rule.dst)} : ${rule.port === "any" ? "any port" : rule.port}`;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const puzzle = currentPuzzle(state);
  const verdicts = evaluate(SCENARIO, puzzle, state.config);
  const committed = state.phase === "committed";
  const record = committed ? state.records[state.records.length - 1] : null;
  const showResults = tested || committed;
  const tracedVerdict = traced ? verdicts.find((verdict) => verdict.packet === traced) : null;
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${SCENARIO.puzzles.length}</strong><span>Change</span></div>
    <div class="count"><strong>${showResults ? `${verdicts.filter((v) => v.ok).length}/${verdicts.length}` : "–"}</strong><span>Tests passing</span></div>`;
  $("#ticket").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Change ticket</h2><span class="phase-pill">${committed ? "Pushed" : "Open"}</span></div>
    <div class="d-scroll">
      <p class="kicker">CHG-${2041 + state.index} · ${esc(SCENARIO.title)}</p>
      <h3 class="case-title">${esc(puzzle.title)}</h3>
      <p class="brief">${esc(puzzle.brief)}</p>
      <p class="default-line">If no rule matches, this firewall will <b class="${puzzle.defaultAction}">${puzzle.defaultAction.toUpperCase()}</b>.</p>
      ${
        record
          ? `<div class="score-grid">
               ${tile("Correct", record.score.correct, 70, `${record.score.right} of ${record.score.packets} packets right`)}
               ${tile("Tidy", record.score.tidy, 30, record.score.right === record.score.packets ? `${record.score.changes} change${record.score.changes === 1 ? "" : "s"}; ${record.score.minimal} needed` : "Only counted once every packet is right")}
             </div>
             <div class="lesson"><strong>Why it matters.</strong> ${esc(puzzle.lesson)}</div>
             <button class="btn primary" data-act="next">${state.index + 1 < SCENARIO.puzzles.length ? "Next change" : "See debrief"}</button>`
          : `<ol class="howto-list">
               <li><b>Trace</b> a packet to see which rule catches it. First match wins.</li>
               <li><b>Move</b> rules with ↑ ↓, or switch one <b>off</b>.</li>
               <li><b>Run all tests</b> as often as you like, then <b>push</b>.</li>
             </ol>
             <p class="muted small">Score: 70 for packets right, 30 for doing it in the fewest changes. Testing is free.</p>`
      }
    </div>`;
  $("#rules").innerHTML = `
    <div class="col-head"><h2>Rules · top to bottom</h2><span class="muted">first match wins</span></div>
    <ol class="rule-list">
      ${state.config.order
        .map((id, index) => {
          const rule = puzzle.rules.find((entry) => entry.id === id)!;
          const off = state.config.disabled.includes(id);
          const hit = tracedVerdict?.rule === id;
          const passedOver = tracedVerdict && !off && (tracedVerdict.rule === null || state.config.order.indexOf(tracedVerdict.rule) > index);
          return `<li class="rule ${rule.action} ${off ? "off" : ""} ${hit ? "hit" : ""} ${passedOver ? "passed" : ""}">
            <span class="num">${index + 1}</span>
            <span class="act">${rule.action.toUpperCase()}</span>
            <span class="what"><strong>${ruleText(rule)}</strong><small>${esc(rule.note)}${off ? " · switched off" : ""}</small></span>
            <span class="ctl">
              <button data-act="up" data-id="${id}" aria-label="Move rule ${index + 1} up" ${committed || index === 0 ? "disabled" : ""}>↑</button>
              <button data-act="down" data-id="${id}" aria-label="Move rule ${index + 1} down" ${committed || index === state.config.order.length - 1 ? "disabled" : ""}>↓</button>
              <button data-act="toggle" data-id="${id}" aria-pressed="${!off}" aria-label="${off ? "Switch on" : "Switch off"} rule ${index + 1}" ${committed ? "disabled" : ""}>${off ? "On" : "Off"}</button>
            </span>
          </li>`;
        })
        .join("")}
      <li class="rule default ${puzzle.defaultAction} ${tracedVerdict && tracedVerdict.rule === null ? "hit" : ""}"><span class="num">∞</span><span class="act">${puzzle.defaultAction.toUpperCase()}</span><span class="what"><strong>Default: anything not matched above</strong><small>Built in, cannot be moved</small></span></li>
    </ol>`;
  $("#packets").innerHTML = `
    <div class="col-head"><h2>Test packets</h2>${committed ? "" : `<button class="btn small-btn" data-act="run">Run all tests</button>`}</div>
    <ul class="packet-list">
      ${puzzle.packets
        .map((packet) => {
          const verdict = verdicts.find((entry) => entry.packet === packet.id)!;
          const isTraced = traced === packet.id;
          return `<li class="packet ${isTraced ? "traced" : ""} ${showResults ? (verdict.ok ? "pass" : "fail") : ""}">
            <div class="p-main">
              <strong>${esc(packet.label)}</strong>
              <code>${esc(packet.src)} → ${esc(host(SCENARIO, packet.dst).label)} : ${packet.port}</code>
              <span class="intent ${packet.intent}">Should ${packet.intent.toUpperCase()}</span>
            </div>
            ${isTraced || showResults ? `<p class="p-result">${traceLine(verdict.rule, verdict.action)}${showResults ? (verdict.ok ? " ✓" : " ✕ wrong") : ""}</p>` : ""}
            ${isTraced ? `<p class="p-why">${esc(packet.why)}</p>` : ""}
            <button class="btn small-btn trace" data-act="trace" data-id="${packet.id}" aria-pressed="${isTraced}">${isTraced ? "Hide trace" : "Trace"}</button>
          </li>`;
        })
        .join("")}
    </ul>
    ${committed ? "" : `<div class="push-row"><button class="btn ghost" data-act="reset">Reset to the original order</button><button class="btn primary submit" data-act="commit">Push to firewall</button></div>`}`;
}

function traceLine(ruleId: string | null, action: string): string {
  const puzzle = currentPuzzle(state);
  if (!ruleId) return `No rule matched → default <b class="${action}">${action.toUpperCase()}</b>`;
  const position = state.config.order.indexOf(ruleId) + 1;
  return `Caught by rule ${position} (${esc(puzzle.rules.find((rule) => rule.id === ruleId)!.note)}) → <b class="${action}">${action.toUpperCase()}</b>`;
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  const { act, id } = target.dataset;
  const focusKey = `[data-act="${act}"]${id ? `[data-id="${id}"]` : ""}`;
  if (act === "up" || act === "down") {
    move(state, id!, act === "up" ? -1 : 1);
    tested = false;
    play("click");
  } else if (act === "toggle") {
    toggleRule(state, id!);
    tested = false;
    play("click");
  } else if (act === "trace") {
    traced = traced === id ? null : id!;
    state.traces += 1;
    play("click");
  } else if (act === "run") {
    tested = true;
    state.runs += 1;
    const verdicts = evaluate(SCENARIO, currentPuzzle(state), state.config);
    const passing = verdicts.filter((verdict) => verdict.ok).length;
    play(passing === verdicts.length ? "success" : "alarm");
    announce(`${passing} of ${verdicts.length} tests passing.`);
  } else if (act === "reset") {
    reset(state);
    tested = false;
  } else if (act === "commit") {
    const score = commit(state);
    post("statement", { at: new Date().toISOString(), verb: "submitted", object: currentPuzzle(state).id, result: { score: score.total, changes: score.changes } });
    play(score.total >= 85 ? "success" : "setback");
    announce(`Pushed. ${score.right} of ${score.packets} packets right. Score ${score.total}.`);
    traced = null;
  } else if (act === "next") {
    nextPuzzle(state);
    traced = null;
    tested = false;
  } else if (act === "retry") {
    start();
    return;
  } else return;
  render();
  document.querySelector<HTMLElement>(focusKey)?.focus();
});

function renderDebrief(): void {
  const summary = summarize(state);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, puzzles: state.records });
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Rule hygiene ${summary.total}<small>/100</small></h2>
        <p class="muted">${summary.solved} of ${summary.puzzles} changes pushed with every packet right.</p>
      </header>
      <section class="panel">
        <h3>Change by change</h3>
        <table class="plan-table"><thead><tr><th scope="col">Change</th><th scope="col">Packets right</th><th scope="col">Changes (fewest)</th><th scope="col">Lesson</th></tr></thead><tbody>
        ${state.records
          .map((record) => {
            const puzzle = SCENARIO.puzzles.find((entry) => entry.id === record.puzzle)!;
            return `<tr><th scope="row">${esc(puzzle.title)}<br /><small class="muted">${record.score.total}/100</small></th><td>${record.score.right}/${record.score.packets}</td><td>${record.score.changes} (${record.score.minimal})</td><td>${esc(puzzle.lesson)}</td></tr>`;
          })
          .join("")}</tbody></table>
      </section>
      <section class="panel">
        <h3>What this practised</h3>
        <ul class="objectives">
          <li>Reading a rule list the way the firewall does: top to bottom, first match wins.</li>
          <li>Spotting shadowed rules, a misplaced cleanup rule, and an over-broad legacy exception.</li>
          <li>Knowing what the default action is before deleting anything.</li>
          <li>Making the smallest change that meets the intent, the way a real change window demands.</li>
        </ul>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Content pending SME review (docs/design/RULE_ORDER.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function start(): void {
  state = createGame(SCENARIO);
  traced = null;
  tested = false;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  showModal({
    kicker: `${SCENARIO.org} · Change window`,
    title: "Rule Order",
    body: `
      <p>Tonight's change window has four tickets for <strong>FW-CORE</strong>, the firewall between Meridian Freight's offices, servers and the internet.</p>
      <p>A firewall reads its rules <strong>top to bottom</strong> and stops at the <strong>first rule that matches</strong>. Each ticket has test packets with the verdict they should get. Reorder rules, or switch them off, until every packet is right. Then push.</p>
      <p class="note"><span>Trace and test as much as you like. You score for getting every packet right and for doing it in the fewest changes, as in a real change window.</span></p>
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>`,
    actions: [{ label: "Open the first ticket", primary: true, onClick: () => undefined }],
    onMount: (root) =>
      root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
        settings.sound = (event.target as HTMLInputElement).checked;
        saveSettings(settings);
        setSoundEnabled(settings.sound);
      }),
  });
}

start();
