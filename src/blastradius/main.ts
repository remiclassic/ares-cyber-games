import "../ui/practice.css";
import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, showTutorial, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data/scenario";
import { ACTIVITY_ID, createBlastHost } from "./host";
import { renderDebrief } from "./ui/debrief";
import { BlastGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createBlastHost();
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
let attempt = 0;
const started = performance.now();

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.logic;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new BlastGame(SCENARIO, host, (state) => {
  show("debrief");
  const summary = renderDebrief(state, { retry: () => briefing(true) });
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((performance.now() - started) / 1000),
    seed: state.seed,
    attempt: state.attempt,
    score: summary,
    learningEvidence: state.records.filter((record) => record.check).map((record) => ({ caseId: record.caseId, question: record.check!.question, correct: !!record.answer?.correct })),
    cases: state.records,
  });
  $("#debrief-title").focus();
});

// The first-time walkthrough: what is going on, what is on the map, the three moves, one worked
// example, and how it is scored. Reopenable at any time from the header.
function tutorialPages(retry: boolean): TutorialPage[] {
  const { readSensor, triage } = SCENARIO.costs;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">An attacker stole the <strong>svc-backup</strong> service account. Some computers on the network are now infected: each infected one ${esc(SCENARIO.indicator)}.</p>
        <p class="tut-lead">You do not know which ones. Your job, in each of ${SCENARIO.cases.length} cases:</p>
        <ol class="tut-moves">
          <li><span><b>Find the infected computers</b> using the evidence on the map.</span></li>
          <li><span><b>Isolate them</b> (cut them off the network) to stop the attacker.</span></li>
          <li><span><b>Keep the clean ones online.</b> Isolating a clean computer stops people working, and it costs you points.</span></li>
        </ol>
        <p class="tut-note">${ICONS.shield}<span>The trick is to <strong>prove</strong> which computers are infected before you act. Pulling every plug is the easy way out, and it scores badly.</span></p>`,
    },
    {
      title: "What is on the map",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico disc">${ICONS.workstation}</span><span><b>Circles are computers</b>Each one is infected or clean. You decide what to do with every one.</span></div>
          <div><span class="tut-ico hex">?</span><span><b>Hexagons are sensors</b>A sensor watches the computers its lines connect to. It shows <b style="display:inline">?</b> until you read it.</span></div>
          <div><span class="tut-ico hex">2</span><span><b>A read sensor shows a count</b>"2" means 2 of the computers it watches are infected. It never says <em>which</em> ones.</span></div>
          <div><span class="tut-ico box">${ICONS.clock}</span><span><b>Case time</b>Top right. Reading and triage spend minutes. When time runs out you can still decide, but not gather more evidence.</span></div>
        </div>
        <p class="tut-note">${ICONS.logic}<span>Click anything on the map to see its details in the right-hand panel. Selecting a sensor highlights the lines to the computers it watches.</span></p>`,
    },
    {
      title: "Your three moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read a sensor</b> · ${readSensor} min<span class="how">Click a hexagon, then press <span class="tut-pill">Read sensor</span> in the right panel (or <kbd>R</kbd>). Cheap, and it covers several computers at once. Start here.</span></span></li>
          <li><span><b>Triage a computer</b> · ${triage} min<span class="how">Click a circle, then press <span class="tut-pill">Triage host</span> (or <kbd>T</kbd>). It tells you for certain whether that one computer is infected. Expensive, so use it only where the counts leave a real question.</span></span></li>
          <li><span><b>Decide every computer</b><span class="how">Click a circle and choose <span class="tut-pill">Isolate</span> <kbd>1</kbd>, <span class="tut-pill">Keep online</span> <kbd>2</kbd> or <span class="tut-pill">Watch</span> <kbd>3</kbd>. When every computer has a decision, press <span class="tut-pill">Close case</span> at the bottom right.</span></span></li>
        </ol>
        <p class="tut-note">${ICONS.watch}<span><strong>Watch</strong> means "keep it running, but monitor it". Use it only when the evidence truly cannot decide, and only after reading the sensors that see that computer.</span></p>`,
    },
    {
      title: "Worked example",
      body: `
        <p>Four computers, A to D, and two sensors. (A made-up example, not one of the cases.)</p>
        <div class="tut-ex">
          <div class="row"><span class="tag sensor">Sensor 1 watches A, B, C</span><span class="arrow">→</span><span>counts <b>1</b></span></div>
          <div class="row"><span class="tag sensor">Sensor 2 watches C, D</span><span class="arrow">→</span><span>counts <b>0</b></span></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>Sensor 2 counted 0</b>, so C and D are both clean.<span class="how">A zero clears every computer behind it, for free.</span></span></li>
          <li><span><b>Sensor 1 counted 1</b>, and C is clean, so it is A or B.<span class="how">The counts cannot say which. This is where a triage is worth its ${triage} minutes.</span></span></li>
          <li><span><b>Triage A: infected.</b> So B is clean.<span class="how">One triage settled both A and B.</span></span></li>
        </ol>
        <div class="tut-ex"><div class="row"><span class="then">Decision:</span><span class="tag hot">Isolate A</span><span class="tag ok">Keep B online</span><span class="tag ok">Keep C online</span><span class="tag ok">Keep D online</span></div></div>
        <p class="tut-note">${ICONS.logic}<span>On the map, each read sensor shows a small <strong>x/y</strong> badge: computers you marked to isolate behind it / its count. Close the case when every badge matches.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Containment <small>40</small></b>Infected computers you isolated.</div>
          <div><b>Continuity <small>30</small></b>Clean computers you kept online. Critical servers (marked !) count three times.</div>
          <div><b>Evidence <small>20</small></b>Calls your evidence actually proved. A lucky guess earns less than a deduction.</div>
          <div><b>Efficiency <small>10</small></b>Not spending triages you did not need.</div>
        </div>
        <p>After each case the map shows the truth, a score breakdown, and one quick question about your reasoning. Click any computer to see why your call scored as it did.</p>
        <p class="tut-muted">Case time limits what you can check. How fast you play is never scored.</p>
        ${retry ? `<p class="tut-note">${ICONS.retry}<span>Retry: same networks, different truth. The counts will not match last time.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>
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
  root.querySelector<HTMLInputElement>("#opt-large")!.addEventListener("change", (event) => {
    settings.largeText = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
  });
}

function briefing(retry = false): void {
  if (retry) {
    attempt += 1;
    host.record({ verb: "retried", object: SCENARIO.id, result: { attempt } });
  }
  show("game");
  game.start(seed, attempt);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.title} · How to play`,
    pages,
    // A retry opens on the last page: the scoring reminder and the retry note.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Start case 1",
    onStart: () => $("#casefile").querySelector<HTMLElement>("h2")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.title} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

briefing();
