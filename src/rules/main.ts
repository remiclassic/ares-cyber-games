import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import { WEIGHTS, commit, createGame, currentPuzzle, evaluate, host, move, initialConfig, nextPuzzle, reset, summarize, toggleRule, type GameState, type Rule, type Verdict } from "./engine";

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
  $("#rule-list").innerHTML = `
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
      <li class="rule default ${puzzle.defaultAction} ${tracedVerdict && tracedVerdict.rule === null ? "hit" : ""}"><span class="num">∞</span><span class="act">${puzzle.defaultAction.toUpperCase()}</span><span class="what"><strong>Default: anything not matched above</strong><small>Built in, cannot be moved</small></span></li>`;
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
  renderNext(verdicts, tracedVerdict ?? null);
}

// The live "Next" bar: the next thing to do in the current state. It reads out what the screen
// already shows (which rule caught a traced packet, how many tests pass) and never says which
// rule to move or switch off.
function renderNext(verdicts: readonly Verdict[], tracedVerdict: Verdict | null): void {
  const bar = $("#next-step");
  const puzzle = currentPuzzle(state);
  let step: NextStep;
  if (state.phase === "committed") {
    const record = state.records[state.records.length - 1];
    const last = state.index + 1 >= SCENARIO.puzzles.length;
    step = {
      label: "Done",
      tone: "ready",
      text: `<strong>Pushed:</strong> ${record.score.right} of ${record.score.packets} packets right, ${record.score.total}/100. Read <strong>Why it matters</strong> on the left, then press <strong>${last ? "See debrief" : "Next change"}</strong>.`,
      hint: "Each packet now shows the rule that caught it, with ✓ or ✕.",
      targets: ['[data-act="next"]'],
    };
  } else if (tested) {
    const failing = verdicts.filter((verdict) => !verdict.ok);
    if (failing.length) {
      const first = puzzle.packets.find((packet) => packet.id === failing[0].packet)!;
      step = {
        label: "Check",
        tone: "warn",
        text: `${failing.length} of ${verdicts.length} test${verdicts.length === 1 ? "" : "s"} fail (red edge). Press <strong>Trace</strong> on a failing packet, such as <strong>${esc(first.label)}</strong>, to see which rule catches it.`,
        hint: "Then move a rule with ↑ ↓ or switch one Off, and run the tests again.",
        targets: [`[data-act="trace"][data-id="${first.id}"]`],
      };
    } else {
      step = {
        label: "Ready",
        tone: "ready",
        text: `All ${verdicts.length} tests pass. Press <strong>Push to firewall</strong> to commit this change.`,
        hint: "Tidy is scored on how far your final list is from the original (one per step up or down, one per switch), not on how many clicks it took.",
        targets: ['[data-act="commit"]'],
      };
    }
  } else if (tracedVerdict) {
    const packet = puzzle.packets.find((entry) => entry.id === tracedVerdict.packet)!;
    const where = tracedVerdict.rule ? `rule ${state.config.order.indexOf(tracedVerdict.rule) + 1}` : "the default (no rule matched)";
    step = {
      text: `<strong>${esc(packet.label)}</strong> is caught by ${where}, highlighted.${tracedVerdict.rule && state.config.order.indexOf(tracedVerdict.rule) === 0 ? "" : " The rules above it were checked and did not match."} Trace other packets, or press <strong>Run all tests</strong> to check them all.`,
      hint: `It should ${packet.intent.toUpperCase()}. Move rules with ↑ ↓ or switch one Off if the verdict is wrong.`,
      targets: ['[data-act="run"]'],
    };
  } else if (!sameAsStart()) {
    step = {
      text: `You changed the rules. Press <strong>Run all tests</strong> to see whether every packet now gets the verdict it should.`,
      targets: ['[data-act="run"]'],
    };
  } else {
    step = {
      text: `Read the ticket on the left. Then press <strong>Trace</strong> on a test packet to see which rule catches it, or <strong>Run all tests</strong> to check them all.`,
      hint: `Rules are read top to bottom; the first match wins. If nothing matches, the default is ${puzzle.defaultAction.toUpperCase()}.`,
      targets: ['#packets .packet [data-act="trace"]'],
    };
  }
  renderNextStep(bar, step);
}

function sameAsStart(): boolean {
  const start = initialConfig(currentPuzzle(state));
  return start.order.join() === state.config.order.join() && state.config.disabled.length === 0;
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
    start(true);
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

// The first-time walkthrough: the mission, what is on screen, the moves, how first match works
// (a made-up rule list, not one of the tickets), and how it is scored. Reopenable from the header.
function tutorialPages(retry: boolean): TutorialPage[] {
  const tickets = SCENARIO.puzzles.length;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">Tonight's change window has ${tickets} tickets for <strong>FW-CORE</strong>, the firewall between ${esc(SCENARIO.org)}'s offices, servers and the internet.</p>
        <p class="tut-lead">Each ticket comes with a rule list that is not doing what it should, and a set of <strong>test packets</strong>, each marked with the verdict it should get. For every ticket:</p>
        <ol class="tut-moves">
          <li><span><b>Work out why packets get the wrong verdict</b><span class="how">Trace them through the rules.</span></span></li>
          <li><span><b>Fix the rule list</b><span class="how">Move rules up or down, or switch rules off. You cannot add or edit rules.</span></span></li>
          <li><span><b>Make the smallest change that works</b><span class="how">As in a real change window: every packet right, with as few changes as possible.</span></span></li>
        </ol>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">☰</span><span><b>Change ticket</b>Left. What the ticket asks for, and what this firewall does when no rule matches: its <b style="display:inline">default</b>, ALLOW or DENY.</span></div>
          <div><span class="tut-ico box rules-allow">ALLOW</span><span><b>A rule</b>Middle. Its number, ALLOW or DENY, then <em>source → destination : port</em>, and a note on what it is for.</span></div>
          <div><span class="tut-ico box">∞</span><span><b>Default row</b>The last line of the list. Built in; it catches anything no rule matched and cannot be moved.</span></div>
          <div><span class="tut-ico box">⇢</span><span><b>Test packet</b>Right. Where it comes from, where it is going, the port, and <b style="display:inline">Should ALLOW</b> or <b style="display:inline">Should DENY</b>.</span></div>
          <div><span class="tut-ico box">✓ ✕</span><span><b>Test results</b>After a test run, passing packets get a green edge and failing ones a red edge. Top right counts the tests passing.</span></div>
          <div><span class="tut-ico box">1/${tickets}</span><span><b>Change</b>Top right. Which ticket you are on.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Trace a packet</b><span class="how">Press <span class="tut-pill">Trace</span> on a packet. The rule that catches it lights up, the rules above it dim, and the packet shows the verdict it gets. <span class="tut-pill">Hide trace</span> clears it.</span></span></li>
          <li><span><b>Move a rule</b><span class="how">Press <span class="tut-pill">↑</span> or <span class="tut-pill">↓</span> on the rule to swap it with its neighbour.</span></span></li>
          <li><span><b>Switch a rule off</b><span class="how">Press <span class="tut-pill">Off</span>. It is struck through and ignored. <span class="tut-pill">On</span> brings it back.</span></span></li>
          <li><span><b>Run all tests</b><span class="how">Press <span class="tut-pill">Run all tests</span> above the packets to check every verdict at once. Moving or switching a rule clears the results, so run them again.</span></span></li>
          <li><span><b>Push</b><span class="how">When you are happy, press <span class="tut-pill">Push to firewall</span>. Then <span class="tut-pill">Next change</span>. <span class="tut-pill">Reset to the original order</span> undoes everything on this ticket.</span></span></li>
        </ol>
        <p class="tut-note"><span>Tracing and testing are free. Use them as much as you like before you push.</span></p>`,
    },
    {
      title: "How first match works",
      body: `
        <p>The firewall reads the rules <strong>top to bottom</strong> and stops at the <strong>first rule that matches</strong>. A rule matches only if the source, the destination <em>and</em> the port all fit. A made-up list (not one of the tickets), with a default of DENY:</p>
        <div class="tut-ex">
          <div class="row"><span class="tag ok">1 ALLOW</span><span>Anything → Web servers : 443</span></div>
          <div class="row"><span class="tag hot">2 DENY</span><span>Lab 10.9.0.0/24 → anything : any port</span></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>Lab PC → web server : 443</b> gets <b>ALLOW</b> from rule 1.<span class="how">Rule 2 also fits, but the firewall never reaches it: rule 1 matched first.</span></span></li>
          <li><span><b>Lab PC → file server : 445</b> gets <b>DENY</b> from rule 2.<span class="how">Rule 1 does not fit (wrong destination and port), so the firewall moves on.</span></span></li>
          <li><span><b>Office PC → file server : 445</b> gets <b>DENY</b> from the default.<span class="how">Neither rule fits, so the default decides.</span></span></li>
        </ol>
        <p class="tut-note"><span>One <strong>change</strong> is one step up or down, or one switch off or on. Moving a rule three places is three changes.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Correct <small>${WEIGHTS.correct}</small></b>Shared across the packets: each packet with the right verdict earns its share.</div>
          <div><b>Tidy <small>${WEIGHTS.tidy}</small></b>Full marks if you used the fewest changes possible, less the more you used. Only counted once every packet is right.</div>
        </div>
        <p>Changes are counted between the original list and the list you push, not by how many clicks it took to get there. Your final score is the average of the ${tickets} tickets.</p>
        <p>After you push, each packet shows the rule that caught it, and the ticket explains why it matters.</p>
        <p class="tut-muted">There is no timer.</p>
        ${retry ? `<p class="tut-note"><span>Retry: the same ${tickets} tickets, back in their original order.</span></p>` : ""}
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
  traced = null;
  tested = false;
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
    startLabel: retry ? "Start again" : "Open the first ticket",
    onStart: () => document.querySelector<HTMLElement>("#ticket h2")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
