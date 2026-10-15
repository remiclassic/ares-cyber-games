import "../ui/practice.css";
import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, showTutorial, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data/scenario";
import { ACTIVITY_ID, createCounterplayHost } from "./host";
import { techniqueOf } from "./sim/engine";
import { renderDebrief } from "./ui/debrief";
import { CounterplayGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createCounterplayHost();
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
let attempt = 0;
const started = performance.now();

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.cards;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new CounterplayGame(SCENARIO, host, (state) => {
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
    learningEvidence: state.records.flatMap((record) => {
      const incident = SCENARIO.incidents.find((entry) => entry.id === record.incidentId)!;
      return record.hands.map((hand) => ({ incidentId: record.incidentId, technique: hand.technique, named: hand.identified ?? "", correct: hand.identified === techniqueOf(incident, hand.technique).name }));
    }),
    incidents: state.records,
  });
  $("#debrief-title").focus();
});

// The first-time walkthrough: the situation, what is on the table, the moves, how one hand
// resolves (a made-up example), and how it is scored. Reopenable from the header at any time.
function tutorialPages(retry: boolean): TutorialPage[] {
  const target = SCENARIO.target;
  const n = SCENARIO.incidents.length;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are the incident responder on call at <strong>${esc(SCENARIO.org)}</strong> this week. ${n} incidents are coming: ${SCENARIO.incidents.map((incident) => `<em>${esc(incident.title)}</em>`).join(", ")}.</p>
        <p class="tut-lead">Each incident is played as a duel against the attacker (the <strong>actor</strong>). The actor plays technique cards face down; all you see is the <strong>telemetry</strong> each one leaves behind: a single log line.</p>
        <ol class="tut-moves">
          <li><span><b>Work out what the actor just did</b> from the log line.</span></li>
          <li><span><b>Answer it with the response that stops it.</b><span class="how">A response that only sounds related does not count.</span></span></li>
          <li><span><b>Reach ${target} points before the actor does.</b><span class="how">If they get there first, they reach their objective.</span></span></li>
        </ol>
        <p class="tut-note">${ICONS.shield}<span>There is no timer. Take the time to read each log line properly.</span></p>`,
    },
    {
      title: "What is on the table",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box" style="color:#ff9aa4">${ICONS.question}</span><span><b>The actor's card</b>Face down until you have responded. Then it flips to show the real technique.</span></div>
          <div><span class="tut-ico box" style="color:#8ff0b8">${ICONS.terminal}</span><span><b>Telemetry</b>The log line the technique left, and the system it came from (mail gateway, EDR, cloud audit trail…).</span></div>
          <div><span class="tut-ico box">${ICONS.eye}</span><span><b>Three names</b>One is the real technique; two are look-alikes: benign activity or a neighbouring technique.</span></div>
          <div><span class="tut-ico box" style="color:#38d6f5">${ICONS.cards}</span><span><b>Your toolkit</b>The response cards for this incident. A used card greys out.</span></div>
        </div>
        <p class="tut-muted">Top right: your points (circles), the actor's points (diamonds) and the incident number. Left panel: the incident, what the actor is after, and the hands played so far. The <strong>Next</strong> bar above the table always says what to do now.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read the telemetry</b><span class="how">Who, from where, how often, and what changed. That is where the look-alikes differ.</span></span></li>
          <li><span><b>Name the technique</b><span class="how">Under "What technique does this telemetry show?", click one of the three options, or press <kbd>1</kbd>, <kbd>2</kbd> or <kbd>3</kbd>. Your choice locks in; you find out if it was right at the reveal.</span></span></li>
          <li><span><b>Play a response card</b><span class="how">Click a card in <b style="display:inline">Your toolkit</b>. Each card can be used once per incident, so think about what you may need later.</span></span></li>
          <li><span><b>Read the reveal and go on</b><span class="how">The actor's card flips and you see why your card worked or not. Press <span class="tut-pill">Next telemetry</span>. When an incident ends, press <span class="tut-pill">Next incident</span> (after the last one, <span class="tut-pill">See debrief</span>).</span></span></li>
        </ol>`,
    },
    {
      title: "How a hand plays out",
      body: `
        <p>A made-up hand, not one from the game:</p>
        <div class="tut-ex">
          <div class="row"><span class="then">Telemetry:</span><code>edr 10:14 host=WS-55 browser extension installed name="PDF Helper" permissions=all sites, cookies source=sideloaded</code></div>
          <div class="row"><span class="then">You name it:</span><span class="tag ok">Malicious browser extension</span><span class="then">not</span><span class="tag">Routine browser update</span><span class="tag">Drive-by download</span></div>
        </div>
        <div class="tut-ex">
          <div class="row"><span class="tag ok">Remove the extension and block its ID</span><span class="arrow">→</span><span><b>Counter:</b> you score 1</span></div>
          <div class="row"><span class="tag">Reset the user's password</span><span class="arrow">→</span><span><b>Partial:</b> helps, but the stolen cookies still work. Nobody scores</span></div>
          <div class="row"><span class="tag hot">Send a security awareness reminder</span><span class="arrow">→</span><span><b>Miss:</b> the actor scores 1</span></div>
        </div>
        <p class="tut-note">${ICONS.cards}<span>The actor adapts: when you counter a move, their next technique may change. If their playbook runs out before anyone reaches ${target}, the higher score wins the incident; a tie is a stalemate.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Named it <small>30</small></b>Share of techniques you named right from the telemetry.</div>
          <div><b>Response <small>40</small></b>Share of hands where you played the best card you still had. A partial when a counter was left earns half.</div>
          <div><b>Outcome <small>30</small></b>Win the incident: 30. Stalemate: 15. The actor wins: 0.</div>
        </div>
        <p>Each incident is scored out of 100; your final score is the average of the ${n}. "Best card you still had" means a used card is never held against you.</p>
        ${retry ? `<p class="tut-note">${ICONS.retry}<span>Retry: same incidents, different hosts, users, addresses and option order.</span></p>` : ""}
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

const KICKER = `${SCENARIO.org} · How to play`;

function briefing(retry = false): void {
  if (retry) {
    attempt += 1;
    host.record({ verb: "retried", object: SCENARIO.id, result: { attempt } });
  }
  show("game");
  game.start(seed, attempt);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: KICKER,
    pages,
    // A retry opens on the last page: the scoring reminder and the retry note.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Deal again" : "Take the first incident",
    onStart: () => document.querySelector<HTMLElement>("#telemetry")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

briefing();
